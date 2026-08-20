---
name: Privacy en data-soevereiniteit
description: Wat er wel en niet mag worden gelogd, getrackt of bewaard in ROUT
type: constraint
---
Verboden:
- Gedragstracking, analytics-profilering, tracking pixels.
- Metadata-logging van bezoekers (IP-adressen, user agents, referrers) buiten wat strikt nodig is om een link te laten werken.
- Een auditlog voor linkaanmaak, linkupdates of profielwijzigingen.
- Referral-bezoeken loggen: de tabel referral_visits is verwijderd; alleen het aantal aanmeldingen (invited_count) telt.
- Externe telemetrie/SaaS voor foutafhandeling (o.a. Sentry, PostHog).

Toegestaan:
- Minimale technische routing voor een short link die de gebruiker expliciet aanvraagt: hash/slug -> doel-URL.
- Server-only velden (forwarding_email, moderation_reason, is_paid, payment_method) blijven onbereikbaar voor anon/publiek.

**Why:** de gebruiker stelt privacy en data-soevereiniteit boven observability en groei-metrics.