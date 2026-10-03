# Legacy Portfolio System and IntelStream

This repository serves the older Portfolio System and IntelStream pages at https://shadrack-portfolio-system.vercel.app.

The current professional portfolio at https://shadrackweb.vercel.app is maintained in `project2`; its served HTML matched that repository on 2 October 2026. Keep this platform available until the IntelStream and contact integrations are reviewed.

Each served HTML page loads one Web Analytics script and one Speed Insights script, with their initialization queues. Enable both products in the owning Vercel project's dashboard and verify collection after deployment. Script integration alone does not establish that dashboard collection is enabled.

Open PRs #3 and #4 are superseded by this main-based monitoring cleanup: #3 uses the older CDN integration and conflicts with main; #4 targets #3's draft branch and duplicates Speed Insights already present on main.
