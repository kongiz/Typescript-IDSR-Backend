import { encrypt, decrypt, hashForLookup } from "../utils/encryption";


interface RawUserInput {
  email?:     string;
  firstname?: string;
  lastname?:  string;
  phone?:     string | null;
  [key: string]: unknown;
}

interface EncryptedUserFields {
  email?:          string | null;
  email_hash?:     string | null;
  firstname?:      string | null;
  firstname_hash?: string | null;
  lastname?:       string | null;
  lastname_hash?:  string | null;
  phone?:          string | null;
  [key: string]: unknown;
}

interface UserRow {
  email?:     string | null;
  firstname?: string | null;
  lastname?:  string | null;
  phone?:     string | null;
  [key: string]: unknown;
}


export const encryptUserFields = (data: RawUserInput): EncryptedUserFields => {
  const result: EncryptedUserFields = { ...data };

  if (data.email) {
    result.email      = encrypt(data.email.toLowerCase().trim());
    result.email_hash = hashForLookup(data.email);
  }
  if (data.firstname) {
    result.firstname      = encrypt(data.firstname.trim());
    result.firstname_hash = hashForLookup(data.firstname);
  }
  if (data.lastname) {
    result.lastname      = encrypt(data.lastname.trim());
    result.lastname_hash = hashForLookup(data.lastname);
  }
  if (data.phone) {
    result.phone = encrypt(data.phone.trim());
  }

  return result;
};

export const decryptUserFields = (user: UserRow | null): UserRow | null => {
  if (!user) return null;

  return {
    ...user,
    email:     decrypt(user.email)     ?? user.email,
    firstname: decrypt(user.firstname) ?? user.firstname,
    lastname:  decrypt(user.lastname)  ?? user.lastname,
    phone:     decrypt(user.phone)     ?? user.phone,
  };
};

export const decryptUserList = (users: UserRow[]): (UserRow | null)[] =>
  users.map(decryptUserFields);