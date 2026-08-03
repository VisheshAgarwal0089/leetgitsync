/**
 * Simple wrapper for Chrome Notifications
 */

export function showNotification(title: string, message: string, isError = false) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: isError ? 'icons/icon-48.png' : 'icons/icon-48.png', // Ideally different icons
    title,
    message,
    priority: isError ? 2 : 0,
  });
}
