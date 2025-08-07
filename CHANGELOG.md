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
- Enhanced speed test charts, layout and colour‑coded progress bar
- Improved loading messages and interface responsiveness
- Grouped test operations by browser and IP with hourly aggregation

### Fixed
- Handle null IP values to avoid template rendering errors
- Log default admin password and require change on first login
- Ensure database directory exists and `/tests` endpoint is accessible
- Resolve missing ping command and other display issues
- Preserve Docker volume by parameterising `DATA_DIR` in deploy script
- Show default admin password and login URL in Docker startup logs
- Prevent speed tests from stalling while loading previous records
- Correct admin record timezone display
- Handle admin record fetch errors and data display issues
- Resolve TypeScript compilation errors in `App.tsx`
- Assert client IP when running tests
- Handle invalid IP values in `mask_ip`


