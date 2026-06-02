/**
 * Vercel Speed Insights initialization
 * This script initializes Speed Insights for tracking Web Vitals
 */

// Initialize the Speed Insights queue
window.si = window.si || function () {
  (window.siq = window.siq || []).push(arguments);
};

// The actual tracking script will be loaded by Vercel when deployed
// For local development, this provides a stub that won't cause errors
if (typeof window !== 'undefined') {
  console.log('[Speed Insights] Initialized - tracking will be active when deployed to Vercel');
}
