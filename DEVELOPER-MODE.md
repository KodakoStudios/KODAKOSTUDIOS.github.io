# Developer Mode

Developer Mode is a free, browser-only screen-testing tool for the GitHub Pages site. It does not use Cloud Functions, Firestore, a payment provider, or a server-side developer account.

## What it can test

- Switch the subscription status shown on the settings page.
- Toggle the AI-tag setting in the settings page.
- Add and clear simulated donation records.

These controls only change local browser storage (`localStorage`). They do not affect real subscriptions, payments, donations, user permissions, or the Fan Community. Test controls are visible to every visitor and are not an administrator feature.

## Reset local test data

Use **このブラウザーのテスト記録を削除** to clear the simulated donation records. Other test settings remain saved in this browser. To reset all Developer Mode settings, clear this site's local storage in the browser's site-data settings.

This implementation avoids Cloud Functions and Firestore costs. The site remains hosted on GitHub Pages; Firebase Authentication, if enabled elsewhere on the site, is separate from Developer Mode.
