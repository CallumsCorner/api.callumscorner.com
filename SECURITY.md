# Security Policy

## About This Repository

This repository exists for **transparency purposes only** - it lets people see how the donation system works. It's not a versioned open-source project, and I don't provide support for self-hosting.

The production server may be ahead of what's published here. If you find something in this repo, it might already be fixed in production.

## Reporting a Vulnerability

If you find a security issue, please report it responsibly:

**Email:** matt@callumscorner.com

Include:
- Description of the vulnerability
- Steps to reproduce (if applicable)
- Whether you've verified it affects the live site or just this published code

I'll acknowledge reports within 48 hours and keep you updated on any fix.

## Rewards

Genuine security vulnerabilities that affect the live system will be rewarded with free donations to use on stream. The amount depends on severity - a critical auth bypass is worth more than a minor info leak.

Not eligible for rewards:
- Issues only affecting this public repo (not production)
- Social engineering or phishing attacks
- Denial of service attacks
- Automated scanner output without proof of concept
- Issues requiring physical access
- AI-generated vulnerability reports without real analysis

## What's In Scope

- Authentication and session handling
- Payment flow integrity (Stripe/PayPal)
- Content filter bypasses
- WebSocket security
- Any way to access admin functionality without credentials
- Data exposure beyond what's already public (donation messages shown on stream)

## What's Out of Scope

- The donate frontend, admin panel, overlay, etc. (those repos aren't public)
- Stripe/PayPal's own security (report to them directly)
- Rate limiting or availability issues
- Self-XSS or issues requiring the victim to paste code

## Security Architecture

See the [Security section in the README](README.md#security) for details on how the system is designed. The short version:

- Session-based auth with HTTP-only cookies
- Network isolation via Docker bridge networks
- Minimal data storage (no emails, no payment details)
- Obscured admin subdomains
- Defence in depth, but also nothing worth stealing

## Public Disclosure

I'd prefer you report issues privately first so I can fix them. After that, you're welcome to write about it publicly - I'll even help you with technical details for a good writeup if you want.

If you do disclose publicly without giving me a chance to fix it first, that's your call, but it won't be eligible for rewards.
