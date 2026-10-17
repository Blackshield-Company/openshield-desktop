# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-16

### Changed

- **Black Steel look** — The app uses the shared OpenShield brand tokens: dark steel surfaces, warm off-white text and a crimson accent. SVG line icons replace emoji across navigation, headings, empty states, approvals and errors, and the shield mark sits in the side rail. The theme switch is labelled and native checkboxes are visible again.
- **Calmer disconnected state** — A quiet status strip with **Open settings**, plus a **Connect / Try Demo mode** card on the chat page, replaces the red banner. The re-pair banner on authentication errors is unchanged.
- **Animated knight** — The chat empty state shows the idle knight; while a reply streams the knight switches from thinking to working; the status strip shows thinking while connecting and error when disconnected. With reduced motion enabled in the OS, a still image is shown instead of the animation.
- **Brand assets** — App icons and favicon are regenerated from the Black Steel shield, and the README has a new hero image and badges.

## [0.1.0]

- Initial version: chat, sessions, approvals, memory browser, doctor and swarm views for a running `openshield serve` instance.
