import { IUserRepository } from '../../repositories/IUserRepository';
import { IOtpRepository } from '../../repositories/IOtpRepository';
import { sendOtpMail } from '@infrastructure/services/mail/mailer';
import { hashPassword,comparePassword } from '@shared/utils/hash';
import { IUser } from '../../entities/IUser';
import { IOTP } from '@domain/entities/IOTP';
import { generateOtp } from '@shared/utils/generateOtp';
import { verifyGoogleToken } from '@infrastructure/services/googleAuth/googleAuthService';
import { generateAccessToken,generateRefreshToken, verifyAccessToken } from '@shared/utils/jwt';
 export class UserAuthUsecases{
    constructor(
        private userRepository:IUserRepository,
        private otpRepository:IOtpRepository,
    ){}

    async preRegistration(userData: IOTP): Promise<void> {
  const { email, username, password } = userData;

  const existingEmail = await this.userRepository.findByEmail(email);
  if (existingEmail){
   throw new Error('Email already taken');
  } 

  const existingUsername = await this.userRepository.findByUsername(username!);
  if (existingUsername){
    throw new Error('Username already taken');
  } 

  const hashedPassword =await hashPassword(password!); 

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  if (!email || !username || !password) {
    throw new Error('Missing required fields');
  }

  await this.otpRepository.saveOtp({
    email,
    username,
    password: hashedPassword,
    otp,
    expiresAt,
    attempts: 0,
  });

  await sendOtpMail(email, otp);
}


    async verifyOtpAndRegister(email:string,otp:string):Promise<void>{
        

       const isValidOtp=await this.otpRepository.verifyOtp(email,otp)
       if(!isValidOtp){
        throw new Error('Invalid OTP')
       }
       const otpDoc=await this.otpRepository.getOtpByEmail(email)
         if (!otpDoc || !otpDoc.username || !otpDoc.password) {
         throw new Error("Incomplete registration data");
    }
       const existing = await this.userRepository.findByEmail(email);
       
        if (existing){
        throw new Error("User already registered");

        } 
       const newUser:IUser={
        email,
        username:otpDoc.username,
        password:otpDoc.password
       }

       await this.userRepository.createUser(newUser)
       await this.otpRepository.deleteOtp(email)
    }

    

async resendOtp(email: string): Promise<void> {
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
        throw new Error("Email already registered");
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.otpRepository.saveOtp({email, otp, expiresAt});
    await sendOtpMail(email, otp);
}

async login(email:string,password:string):Promise<{ user: IUser; accessToken: string; refreshToken: string }>{
    const user=await this.userRepository.findByEmail(email)
    console.log(email,password,'em')
    if (!user) {
          console.log(email,password,'em')

      throw new Error('Incorrect email or password');
    }
    if(user.isBlocked==true){
      throw new Error('user is blocked please contact support');

    }

    if(!user.password){
       throw new Error('Incorrect email or password');

    }

    const isPasswordMatch=await comparePassword(password,user?.password)
    if(!isPasswordMatch){

        throw new Error('Incorrect email or password')
    }
    const payload = {
        id: user._id,
        role: user.role
    };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  //console.log(user._id,'id')
//console.log({payload._id,accessToken,refreshToken},'toekn')
    const publicUser={
        _id: user._id,
    email: user.email,
    username: user.username,
    role: user.role,
    isBlocked:user.isBlocked
    }as IUser
  return { user:publicUser, accessToken, refreshToken };

}

    async forgotPasswordOtp(email:string):Promise<void>{
        const existingEmail=await this.userRepository.findByEmail(email)
        if(!existingEmail){
            throw new Error('User with this email does not exist')
        }
        const otp=generateOtp()
        const expiresAt=new Date(Date.now()+5*60*1000)

        await this.otpRepository.saveOtp({email,otp,expiresAt})
        await sendOtpMail(email,otp)

    }
     async verifyOtpForForgotPassword(email:string,otp:string):Promise<{token:string}>{
        const isValidOtp=await this.otpRepository.verifyOtp(email,otp)
        console.log({email,otp},'y')
        if(!isValidOtp){
        throw new Error('Invalid OTP')
       }
       const payload={
        email:email
       }
       const token=generateAccessToken(payload)
       console.log(token,'token')
       //await this.otpRepository.deleteOtp(email)
       return {token}
       
    }

    async forgotPasswordChange(token:string,password:string):Promise<void>{
      
        const verifyToken=verifyAccessToken(token)
        if(!verifyToken){
            throw new Error('Expired or Invalid Token')
        }

        const email=verifyToken.email
        console.log({email},'from forgotPassword')
       const hashedPassword=await hashPassword(password)
 
       await this.userRepository.updateUserPassword (email,hashedPassword)
    }


    async loginWithGoole(token:string){
      const {email,name,picture,googleId}=await verifyGoogleToken(token)
console.log(email,'google')
console.log(token,'google token')
      let user=await this.userRepository.findByEmail(email)

      if(!user){
        user=await this.userRepository.createUser({
          email,
          username:name,
          profileImage:picture,
          googleId:googleId,
          isGoogleUser:true,
          
        })
      }
      const accessToken=generateAccessToken({id:user._id,email:user.email})
    
      return {accessToken,user}
    }


}