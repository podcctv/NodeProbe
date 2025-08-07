# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Initial FastAPI and React codebase with Docker deployment
- Ping latency measurement, traceroute with downloadable reports, and HTTP speed test
- Display of client IP, ASN, ISP and geolocation for each test
- Admin registration, login and test management interface
- Default to visitor IP for tests and client-side speed test capability
- Speed test progress tracking and persistent record storage

### Fixed
- Handle null IP values to avoid template rendering errors
- Log default admin password and require change on first login
- Ensure database directory exists and `/tests` endpoint is accessible
- Resolve missing ping command and other display issues

