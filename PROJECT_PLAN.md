# Heartlink — Travel-Meetup Lead Engine (Gulf Expat Market)

**Project root:** `C:\Dev\social-discovery`
**Plan owner:** Sobuj
**Last updated:** 2026-09-09

> This file is the durable record of the active plan. Chat history and IDEs come and go;
> this file stays with the repository. Update the status table whenever a step lands.

---

## 1. Positioning

Heartlink is a **travel meetup / travel companion** platform, not a conventional dating site.
The operator curates a small set of real, consenting profiles of people who have upcoming
trips to a target city. Visitors arriving from paid social ads are matched to a profile whose
trip overlaps their location, chat on-site immediately with no registration, and are
progressively converted into a contactable lead.

The travel frame is the product's core differentiator and its compliance shield:

- It creates natural urgency — the person is only in town for a limited window.
- It is low-commitment — "show her the city", not "find a spouse".
- It talks about **the profile**, never about the viewer, which is what Meta's
  personal-attributes policy requires.

---

## 2. Target Market — Phase 1

| Dimension | Value |
| :--- | :--- |
| Ad delivery countries | United Arab Emirates, Saudi Arabia |
| Audience | Indian and Pakistani expatriates living in those countries |
| Explicitly excluded | Local nationals of UAE / Saudi Arabia |
| Profile trips point to | Dubai, Abu Dhabi, Riyadh, Jeddah |
| Languages | English, Hindi, Urdu (Hinglish creatives expected to outperform pure English) |
| Expansion | Add markets only after CPL and reply-rate baselines are established |

### Audience characteristics that drive the design

- Heavily male-skewed, roughly 22–45, living away from family. Loneliness is the primary
  motivator, which is exactly what the travel-companion frame speaks to.
- Near-universal WhatsApp usage; Telegram adoption is also high in this segment.
- Salaries are paid at month end, so intent and engagement peak in the first week of a month.
  Pace ad budget accordingly.
- Peak leisure browsing is Thursday and Friday evenings, roughly 20:00–02:00 Gulf time
  (UTC+4 for UAE, UTC+3 for Saudi Arabia).
- Many expats keep a home-country number (+91 / +92) alongside a local one. WhatsApp
  messaging is billed by the **recipient's** country code, so home-country numbers are
  dramatically cheaper to message than +971 / +966 numbers.

---

## 3. ⚠️ Compliance Constraints (verified 2026-09-09)

These are hard requirements, not suggestions. Breaching them causes **account suspension**,
which is far harder to recover from than a rejected ad.

1. **Written permission is mandatory.** Dating and matchmaking services must be approved by
   Meta before any ad runs. Meta aims to respond within 30 days. Apply first.
2. **Gulf review is stricter than Europe or North America.** Creatives that pass in a
   European context are routinely rejected for the UAE market.
3. **Prohibited outright in UAE dating ads:** any reference to or implication of sexual
   contact, casual encounters, financial arrangements between partners, infidelity, or
   non-monogamous relationships; sexually suggestive visuals, even subtle ones; obvious
   selfies; pixelated or blurred imagery.
4. **"Creating the illusion of communication with fictional people or bots" is prohibited.**
   This bears directly on the staff-assisted messaging model. Mitigations:
   - Profiles must be **real, consenting people**, which is already the operator's intent.
   - Terms of Service must disclose that messaging may be operator-assisted.
   - Never claim a reply is automated-free if it is not; never invent a person.
5. **Landing page is reviewed too.** It must visibly show: product description, Terms of
   Service, Privacy Policy, an 18+ notice, moderation and reporting mechanisms, a support
   contact, and real operator identity.
6. **Age floor 18+** must be set at the ad-set level.
7. **Saudi Arabia carries higher legal and cultural risk than the UAE.** Recommendation:
   launch UAE first, prove the funnel, then approach Saudi Arabia with the travel-companion
   framing only.

---

## 4. Funnel

| Stage | Behaviour | Data captured |
| :--- | :--- | :--- |
| Ad click | Guest lead created silently | Age, gender, city and destination from ad URL params; UTM; geo from IP; device token |
| Match shown | One tap, no form | Which profile, which trip |
| Tap "Say hi" | Name-only prompt, single field | First name |
| Messages 1–2 | Free, no gate | Message content, intent signals |
| Message 3 | Channel handoff sheet | WhatsApp / Telegram / Facebook / phone |
| Verified | Unlimited chat, lead complete | Verified identity on the chosen channel |
| First reply lands | PWA install prompt appears | Push subscription |
| Later | Notification pushed to preferred channel | Re-engagement |

**Channel handoff is framed as a benefit, never as a security wall.** The copy is
"where should we send her reply?", not "verify for safety". This raises conversion and makes
the later outbound message expected rather than spam.

The visitor is never pushed off-site before chatting. On-site chat comes first; the handoff
only appears after they have invested two messages.

---

## 5. Channel Economics

Full interactive breakdown lives in the canvas
`~/.cursor/projects/c-Dev-social-discovery/canvases/lead-channel-economics.canvas.tsx`.

Summary of what matters for this market:

- **Telegram Bot API** — free, unlimited, no messaging window. Primary notification channel.
- **Installed PWA web push** — free, unlimited, and the only channel the operator fully owns.
- **WhatsApp** — best capture channel, but outbound templates are billed per delivered
  message by recipient country. Use selectively, and prefer leads with +91 / +92 numbers.
- **Click-to-WhatsApp ads** — open a free 72-hour entry-point window and historically
  produce a materially lower cost per lead than website campaigns. Worth running in parallel
  as a separate test, but it bypasses the on-site profile experience.
- From **1 October 2026**, free-form WhatsApp service replies inside the 24-hour window
  become billable, with 1,000 free delivered service messages per business number per month.

---

## 6. Identity Model — no registration, still recognisable

A lead is one `User` row with many `LeadIdentity` rows, so the same person is recognised
however they return.

| Layer | Mechanism | Covers |
| :--- | :--- | :--- |
| 1 | Long-lived `httpOnly` JWT cookie (365 days) | Same browser, most returns |
| 2 | `localStorage` device token → `POST /api/auth/device-resume` | Cookie cleared or expired |
| 3 | Contact login on any verified channel | New device |
| 4 | Outbound notification with a signed one-tap resume link | Does not rely on the visitor remembering to return |
| 5 | Web push to an installed PWA | Free, operator-owned |

---

## 7. Implementation Status

### Done before this plan

| Step | State |
| :--- | :--- |
| Guest lead creation from ad criteria + UTM | Done — `POST /api/auth/guest` |
| Verification gate at 2 messages, with admin-reply unlock | Done — `POST /api/conversations/[id]/messages` |
| Contact login by phone / WhatsApp / Telegram | Done — `POST /api/auth/contact-login` |
| Admin lead collection with stage filtering | Done — `GET /api/admin/users`, admin UI |
| Staff replies delivered under the profile's identity | Done — `Message.sentOnBehalfOf` |
| PWA manifest and 192/512 icons | Done — `public/manifest.json` |

### This plan

| Step | Scope | State |
| :--- | :--- | :--- |
| 1 | `LeadIdentity`, `TravelPlan`, market/geo/lead-score fields | Done |
| 2 | `lib/market.ts` — geo detection, Gulf market config, phone-country inference | Done |
| 3 | `lib/leads.ts` — identity dedup, lead scoring, channel preference | Done |
| 4 | Ad-param capture (`g`, `amin`, `amax`, `city`, `dest`, `profile`) on landing | Done |
| 5 | Travel-aware matching and ranking in `GET /api/profiles` | Done |
| 6 | `POST /api/auth/device-resume` for cookie-loss recovery | Done |
| 7 | Name-only first-message prompt; age/gender inferred from ad params | Done |
| 8 | Travel ribbon and urgency badge on profile cards | Done |
| 9 | Channel handoff sheet with reply-delivery framing | Done |
| 10 | Service worker, Android install prompt, iOS instruction sheet | Done |
| 11 | Admin travel-plan management and lead identity columns | Done |
| 12 | Telegram bot notifications, web push delivery | Not started |
| 13 | Meta Pixel events and Conversions API | Pixel events wired (`PageView`, `ViewContent`, `Contact`, `Lead`). Conversions API not started |

---

## 8. Ad Account Setup Checklist

Work to do inside Meta, outside this repository:

- [ ] Apply for dating-ads written permission; expect up to 30 days.
- [ ] Verify the business and set the ad-set age floor to 18+.
- [ ] Publish Terms of Service, Privacy Policy, 18+ notice, moderation policy, and a support
      contact on the public site before submitting anything for review.
- [ ] Install Meta Pixel and fire `PageView`, `ViewContent`, `Contact`, `Lead`.
- [ ] Build custom audiences: visited-not-verified 30 days, chatted-not-verified, and a
      lookalike seeded from verified leads.
- [ ] Structure ad sets per city and per origin segment, for example
      `uae-dubai-in-men-25-34`, and pass `{{adset.name}}` through to `utm_content`.
- [ ] Wire the Conversions API to send hashed contact details for verified leads.

### Ad URL template

```
https://<domain>/?g=female&amin=25&amax=40&city=Dubai&c=AE&dest=Dubai
  &utm_source=facebook&utm_medium=paid
  &utm_campaign={{campaign.name}}&utm_content={{adset.name}}&utm_term={{ad.name}}
```

### Phase 1 Meta targeting (do this in Ads Manager, not in code)

The site never sees who is “local”. Exclusion happens in the ad set.

| Field | UAE set | KSA set |
| :--- | :--- | :--- |
| Location | United Arab Emirates, people **living in** | Saudi Arabia, people **living in** |
| Age | 23–45 | 23–45 |
| Gender | Men | Men |
| Detailed targeting (include) | Expats (India), Expats (Pakistan). If those interests are thin, add Languages: Hindi, Urdu, English AND lived-in India / Pakistan behaviours | Same |
| Detailed targeting (exclude) | Interests that skew local-national (Emirati culture, UAE national day, Arabic-only news pages). Language: Arabic as *exclusion* if reach stays healthy | Same for Saudi national / Arabic-first pages |
| Placement | Facebook + Instagram feed, Advantage+ off at first so you can read which placement converts | Same |
| Schedule | Extra budget Thu–Fri 20:00–02:00 Gulf time, and the first week after payday | Same |
| Optimisation (week 1) | Traffic / landing-page views | Same |
| Optimisation (after ~50 Leads) | Conversion = `Lead` pixel event | Same |

Creative rule of thumb: talk about **her trip**, never about the viewer. Example:

> Priya, 28, Mumbai. In Dubai this week. Looking for someone local to show her the city after work.

Do **not** write “Are you an Indian guy in Dubai?” — that is a personal attribute claim and Meta rejects it.

Chat stays on Heartlink. Ads go to the website, not to WhatsApp. Contact capture is the third-message sheet, framed as “where should we send her reply?”

---

## 9. How to Run

**One command only.** From the project folder:

```powershell
cd C:\Dev\social-discovery
npm run go
```

Or double-click `start.cmd` in File Explorer.

That single command starts Postgres, creates tables, seeds profiles on first run, and opens the site at http://localhost:3000. Keep the window open. Ctrl+C stops everything.

| Command | What it does |
| :--- | :--- |
| `npm run go` / `npm run dev` / `start.cmd` | Everything — use this |
| `npm run db` | Postgres only |
| `npm run build` | Production build |
| `npm start` | Serve production build |

Public site: `http://localhost:3000`
Admin panel: `http://localhost:3000/admin` — `admin@heartlink.com` / `Admin@123456`