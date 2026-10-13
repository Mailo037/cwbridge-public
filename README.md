# CWBridge source export

The web UI is readable. backend.cwvault contains AES-256-GCM encrypted
backend source. The private restoration key is not distributed.
This export is not executable; use a separately compiled release.

Run the published application on Windows with `npx cwbridge`, or install the
existing package globally with `npm install -g cwbridge`. The core is supplied
as an executable; the launcher and web UI remain readable.
