# Auth Email Delivery Report

**Date:** 2026-11-15
**Question:** can student verification, magic-link and administrator activation emails actually be
sent, and do they return to Clubset?
**Bottom line:** the configuration is *capable* of sending, but **no email was sent or received
during this session**, so delivery is **not proven**. The redirect half is fixed in code; the
delivery half needs one real inbox test plus dashboard access this session did not have.

---

## 1. What can be established without dashboard access

| Question | Finding | How established |
| --- | --- | --- |
| Is email/password auth enabled? | Yes | hosted auth settings: email + Google providers enabled, signup enabled |
| Is email confirmation required? | Yes — `mailer_autoconfirm: false` | hosted auth settings |
| Is CAPTCHA enforced? | Yes, on `/token`, `/signup`, `/otp`. A missing **and** an invalid token are both rejected | live probes against the hosted project |
| Custom SMTP configured? | **Unknown.** The SMTP settings are not returned by any API/MCP surface available here. The built-in sender is the default when nothing is configured. | settings read + code inspection |
| Is any SMTP credential in the repo? | No. `src/` contains no SMTP/mailer code at all; no `MAIL_*`, `SMTP_*` or provider key exists in `.env`, `.env.example` or `src/` | `grep` over `src/`, `.env*` |
| Are email templates versioned here? | No. GoTrue hosted templates only; their HTML is not readable without the dashboard. | `supabase/templates/` does not exist; no template config in `config.toml` |
| Any auth error in the last 24 h? | None recorded (no SMTP failures, no rate-limit rejections returned to the app) | hosted auth logs |
| Last confirmation email ever sent | `confirmation_sent_at = 2026-11-06`. 4 email users, 3 confirmed, 3 confirmation emails total, 1 Google user. | `auth.users` aggregate (read-only) |

The zero-emails-in-7-days figure is *not* evidence of a broken sender: the project simply had no
signups that week.

## 2. What the code does now (redirect side, proven by tests)

`useSignUp`, `useSignIn` (magic link) and `useAdminLogin` all pass
`options.emailRedirectTo = emailRedirectUrl()` (see `AUTH_REDIRECT_REMEDIATION_REPORT.md`). That is
the only lever the client has over where an emailed link lands.

Two delivery-relevant consequences:

1. **GoTrue still sends the message.** `emailRedirectTo` changes the link target, not whether the
   mail is sent.
2. **A template that hardcodes `{{ .SiteURL }}` will ignore it.** Hosted templates must use
   `{{ .ConfirmationURL }}` (or `{{ .TokenHash }}` + `{{ .RedirectTo }}`). Templates live in the
   dashboard, not in this repo, so this could not be checked.

## 3. Failure modes already handled in the app

| Upstream outcome | User sees |
| --- | --- |
| Turnstile rejects the request / produces no token | "The human check could not be completed. Please complete the check and try again." (widget resets itself, no reload needed) |
| Password too weak (GoTrue policy) | "Please choose a stronger password with lower case and upper case letters and at least one number." |
| Breached password (HIBP guard, client-side) | the guard's own message, passed through verbatim |
| Rate limited (app + GoTrue) | "Too many attempts. Please wait a few minutes and try again." |
| Network / CORS / offline | "We couldn't reach the sign-in service. Check your connection and try again." |
| Expired or used email link (`error_code=otp_expired`) | "That link is invalid or has expired. Enter your email below and leave the password blank to get a new sign-in link." — no longer misreported as a failed Google sign-in |

Rate limiting is independent of email delivery: `enforceAuthRateLimit` runs before the Supabase
call, and GoTrue applies its own hourly email quota on top. Neither value is readable from here.

## 4. The one test that settles delivery — not run

An inbox test cannot be faked by unit tests, and this session has no mailbox or browser automation.
Do this once, with a real address you control (`mailer_autoconfirm` is **on the hostile side**: the
link is mandatory):

1. Open `https://clubset.vercel.app/signup` (after the frontend deploy) and register.
2. Confirm the message arrives at the inbox (check spam; built-in sender reputation is the usual
   cause of "no email").
3. Click the link. The address bar must be `https://clubset.vercel.app/login…`, **not**
   `joinin-44b91fde-joinin1.vercel.app`, and the browser must land signed in (incomplete student →
   `/onboarding`).
4. Repeat for a magic link (`/login`, password blank) and for the administrator activation email
   from the Administrator tab with an allow-listed address.
5. For a negative check, click a link twice: the second click must show the expired-link copy.

If step 2 fails, the problem is the sender, not the link; if step 3 lands on Joinin, the deploy is
old or a custom template overrides the URL.

## 5. Manual actions required (none performed here)

### 5a. Sender / SMTP (dashboard only — credentials never leave your hands)

Supabase Dashboard → **Authentication → Emails / SMTP Settings**:

- If the built-in sender is in use and mail is not arriving, configure custom SMTP:
  host, port `587` (STARTTLS) or `465` (SSL), username, password, sender address, sender name.
- Any provider works (Resend, Postmark, SES, SendGrid) as long as the sender domain is verified
  with SPF/DKIM.
- Do not put the SMTP password in `.env`, `VITE_*`, the repo, or this conversation.

### 5b. Email quotas

Authentication → Rate Limits: confirm the hourly email quota is above the number of real signups
your school expects in one hour. Defaults reject after 30/hour.

### 5c. Templates

For each of "Confirm signup", "Magic link", "Change email address":
the button `href` must be `{{ .ConfirmationURL }}`. If a template hardcodes
`{{ .SiteURL }}`, replace it — `emailRedirectTo` cannot override that.

### 5d. Site URL (already planned by the user)

Authentication → URL Configuration → Site URL: `https://clubset.vercel.app`, with
`https://clubset.vercel.app/**` in the redirect allow-list.

## 6. Unverified behaviour and risks

- **Delivery is unproven.** No message was sent or received in this session.
- Whether custom SMTP is configured at all is unknown; the API does not expose it.
- Template contents are unknown, so a hardcoded `{{ .SiteURL }}` remains a live possibility.
- GoTrue's hourly email quota and the app's own limiter were not measured together.
- Email provider reputation (spam placement) is outside the codebase's control.
- Microsoft/Outlook and school mail filters commonly drop built-in-sender mail; a verified custom
  sender is the durable fix, not a code change.

## 7. What this report does not claim

It does not claim "email works". It claims: the client now asks for the right destination, the
failure paths are legible, and the remaining risk is concentrated in one place — whether the hosted
sender and templates actually emit and honour that link. That is a dashboard + inbox check, not a
code change.
