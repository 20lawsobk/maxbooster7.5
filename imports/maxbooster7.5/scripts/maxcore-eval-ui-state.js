(() => ({
  pathname: location.pathname,
  controls: Array.from(document.querySelectorAll('button,input,textarea,[role="tab"]')).map(e => ({
    tag: e.tagName,
    testId: e.getAttribute('data-testid'),
    role: e.getAttribute('role'),
    label: e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' ? e.getAttribute('placeholder') : e.textContent?.trim().slice(0, 100),
    disabled: !!e.disabled
  })).filter(e => e.testId || e.role === 'tab' || /generate|compose|connect/i.test(e.label || ''))
}))()