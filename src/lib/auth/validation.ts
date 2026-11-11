export type CredentialFieldErrors = {
  email?: string;
  password?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

export function validateCredentials(
  email: string,
  password: string,
): CredentialFieldErrors {
  const errors: CredentialFieldErrors = {};

  if (!email) {
    errors.email = "Enter your email address.";
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address, like name@example.com.";
  }

  if (!password) {
    errors.password = "Enter your password.";
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    errors.password = `Passwords can be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }

  return errors;
}

export function hasErrors(errors: CredentialFieldErrors): boolean {
  return Boolean(errors.email || errors.password);
}
