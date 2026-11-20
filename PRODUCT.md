# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three roles inside one school:

- **Students** — the primary users. They discover clubs that fit their interests, ask to join, see what is coming up, RSVP to meetings, attend, and follow the clubs they are in.
- **Club leaders / officers** — students who hold per-club permissions. They create events, take attendance, review join requests, send announcements, run the club chat, track dues and spending, build forms and data tables, and run leadership applications.
- **School administrators** — school staff with oversight of every club in their school: they verify new clubs and can act on any club. They are a small, static group, not self-service accounts.

No faculty-advisor, staff-wide, or parent role is in scope. There is also no public marketing surface: every route sits behind sign-in.

Success for a student is simple: they found a club worth joining and showed up. Success for the product is measured the same way — members marked present at club events each week.

## Product Purpose

Clubset is a student-friendly platform for running school club life in one place: discovery, membership, events, attendance, communication, leadership, finances, forms, and shared data.

It exists because club life is normally scattered across a group chat, a spreadsheet, a forms tool, a shared drive, and a payment app, and none of them know about each other. Clubset replaces that with one system where an event, its RSVPs, and its attendance are the same record, and a member's data lives in one place.

## Positioning

The whole of a school's club life in one system, with the complexity hidden. Neighboring products do one slice well — chat, forms, event RSVPs, club directories — and require a student to assemble the rest. Clubset's claim is that the same system already knows who is a member, who came last week, and who is allowed to change what, so a student only makes simple decisions.

## Operating Context

- Used on a school year rhythm: clubs meet weekly or fortnightly; events cluster around term dates.
- The signature flow is **event → RSVP → expected attendance → meeting happens → attendance finalized**, and that history feeds a student's participation record.
- Clubs are typed (volunteer, competitive, recreational), carry commitment levels in weekly hours, and meet on set days and times, so a student can compare fit before joining.
- Interests are chosen from a preset list (Business, Art, Environment, Technology, Sports, Volunteering, Music, Academic, Gaming, Media, Health & Wellness, Community Service) plus student-added ones.
- Leadership changes hands through an application and election flow inside the club, not through an administrator editing a list.
- Clubs hold and spend money (dues, budgets, expenses, balances) and record it in the product.
- Members are onboarded once (school, grade level, interests) and thereafter land on a personal home page.
- School administrators are activated by an emailed link after their address is checked against a private allowlist; students sign up normally and are linked to the deployment's school.

## Capabilities and Constraints

Confirmed from the implementation:

- Club discovery with search and filters; recommended clubs from stated interests; joining via join request.
- Club workspaces: announcements, chat, calendar, funds (dues, budgets, expenses), members, events, attendance, forms, data tables, leadership, settings.
- Per-club permissions (manage membership, events, attendance, forms, data tables, leadership, finances, settings, send announcements), granted through club roles rather than a single "admin" switch.
- Progressive disclosure is a product rule, not a visual preference: management sections appear only when the user actually holds the permission. Members see announcements, chat, calendar, RSVP, and funds.
- Authorization is enforced server-side in Postgres (RLS and RPCs); the client decides only what to show.
- Administrators have management reach over every club in their school — a deliberate, accepted broad privilege.
- Administrator accounts are allowlist-only and the allowlist is developer-managed; the application never reveals whether an address is on it. No real staff names or addresses are committed to the repository.
- Guest (anonymous) sessions are refused; only real signed-in accounts act.
- Authentication: Google one-click, email link, and email/password; rate-limited; passwords checked against known breaches.

Open / inferred, not confirmed by a product owner:

- **One school per deployment.** Recorded as confirmed in an earlier revision of this file (multi-school was noted as planned, with cross-school discovery, isolation, and a school switcher explicitly unbuilt). The README, auth flow, and seed data agree, but the schema carries `school_id` everywhere and keeps administrators scoped per school, so a shared multi-school instance is technically possible. Confirm with the owner before designing multi-school behaviour.

## Brand Commitments

- Name: **Clubset**. The wordmark is the name; no separate logo asset exists.
- **Otter mascot.** `public/assets/otter-idle.webp` and `otter-hover.webp`, rendered by `src/components/otter/OtterBuddy.tsx`; a standalone `otter-preview.html` exists. The otter is the product's personality.
- **Purple identity.** Purple is the brand accent and is treated as fixed; the contrast audit explicitly preserved it and adjusted lightness only.

## Evidence on Hand

- Product principle quoted in the README and treated as binding: *"Clubset should do the complicated work behind the scenes so students only have to make simple decisions."*
- Real implementation, tokens, and components in `src/`; design tokens in `src/styles.css`; shadcn/ui primitives in `src/components/ui/`.
- Security and accessibility evidence exists as reports at the repo root (`SECURITY_NOTES.md`, `SECURITY_INVESTIGATION_REPORT.md`, `ACCESSIBILITY_CONTRAST_AUDIT.md`, `APPLICATION_REGRESSION_REPORT.md`).
- **Absent, do not fabricate:** no customers, testimonials, case studies, press, benchmark numbers, pricing, or school partnerships are recorded anywhere. No school name is committed either — the deployment's school is data, not copy.

## Product Principles

1. **Do the complicated work behind the scenes.** A student should never learn the model to use the product; presets beat free text, plain language beats configuration.
2. **One record, many surfaces.** An event, its RSVPs, and its attendance are the same thing; membership drives every permission. Never duplicate state across features.
3. **Show only what a person can act on.** Visibility follows permission, and permission is always re-checked server-side.
4. **Students own their club; administrators oversee it.** Administrators verify and can intervene, but the club's leaders run it.
5. **Privacy is the default posture.** Minimum data exposure, no oracle that reveals staff membership, no real personal data in the repository.

## Accessibility & Inclusion

Target: **WCAG 2.1 AA**. Token contrast was audited and corrected for both themes (4.5:1 text, 3:1 non-text UI and focus rings), with one documented residual: `--border` on the light `--accent` hover surface stays below 3:1. That audit was calculated from token values and has not been verified in a real browser; treat in-browser confirmation as outstanding work. Keyboard operation and focus visibility are expected throughout, since the product is a form- and dialog-heavy app used during a school day.
