# Turn on leaked-password protection

No code changes. Turn on one setting: Cloud → Users → Auth settings → Email → "Password HIBP Check".

Once it's on, sign-up (`useSignUp` in src/lib/queries.ts) and password change (`updateUser`) turn away leaked passwords. The error message they show already appears on the signup page.
