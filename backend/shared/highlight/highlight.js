// Platform detection
const isAndroid = typeof AndroidBridge !== 'undefined';
const isIframe = window !== window.parent;

// Category toggle
function toggleCategory(category, visible) {
  const elements = document.querySelectorAll(`[data-category="${category}"]`);
  elements.forEach(el => {
    if (visible) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

// Highlight click handler
function onHighlightClick(element) {
  const data = {
    category: element.dataset.category,
    name: element.dataset.name,
    elementId: element.dataset.elementId,
    text: element.textContent,
  };

  showTooltip(element, data);
  sendEvent('onElementTapped', data);
}

// Tooltip
function showTooltip(targetEl, data) {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return;

  document.getElementById('tooltip-category').textContent = data.category.replace(/_/g, ' ');
  document.getElementById('tooltip-name').textContent = data.name;

  const rect = targetEl.getBoundingClientRect();
  tooltip.style.display = 'block';
  tooltip.style.left = Math.min(rect.left, window.innerWidth - 290) + 'px';
  tooltip.style.top = (rect.bottom + 8) + 'px';

  // Auto-hide after 3s
  clearTimeout(window._tooltipTimer);
  window._tooltipTimer = setTimeout(() => {
    tooltip.style.display = 'none';
  }, 3000);
}

// Hide tooltip on click elsewhere
document.addEventListener('click', function (e) {
  if (!e.target.classList.contains('breakdown-highlight')) {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) tooltip.style.display = 'none';
  }
});

// Page visibility tracking via Intersection Observer
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const pageNum = entry.target.dataset.page;
      sendEvent('onPageViewed', { pageNumber: parseInt(pageNum) });
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.script-page').forEach(page => {
  observer.observe(page);
});

// Cross-platform event sending
function sendEvent(type, data) {
  if (isAndroid) {
    try {
      AndroidBridge[type](JSON.stringify(data));
    } catch (e) {
      console.warn('AndroidBridge error:', e);
    }
  } else if (isIframe) {
    window.parent.postMessage({ type, data }, '*');
  }
}

// Listen for messages from parent (React iframe communication)
window.addEventListener('message', function (event) {
  if (!event.data || !event.data.type) return;

  switch (event.data.type) {
    case 'toggleCategory':
      toggleCategory(event.data.category, event.data.visible);
      break;
    case 'scrollToPage':
      const pageEl = document.getElementById('page-' + event.data.pageNumber);
      if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth' });
      break;
  }
});
