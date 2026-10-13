/* The browser is only a convenience check; the server checks its own OS before starting. */
function startBlockReason(status, browser = navigator) {
  if (status?.windows_supported === false) {
    return 'CWBridge can only start on Windows. The computer running the web console uses another operating system.';
  }
  const system = browser.userAgentData?.platform || browser.platform || '';
  const isWindows = system ? /^(?:Windows|Win32|Win64)$/i.test(system)
    : /Windows NT/i.test(browser.userAgent || '');
  if ((system || browser.userAgent) && !isWindows) {
    return 'CWBridge can only start from a Windows device. Open this web console on Windows.';
  }
  return null;
}

export { startBlockReason };
