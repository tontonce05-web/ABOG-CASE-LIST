(function () {
  var categorySelect = document.getElementById('category_id');
  if (!categorySelect) return;

  var sectionFields = document.querySelectorAll('.section-fields');

  function currentSection() {
    var opt = categorySelect.options[categorySelect.selectedIndex];
    return opt ? opt.getAttribute('data-section') : null;
  }

  function applyVisibility() {
    var section = currentSection();
    sectionFields.forEach(function (el) {
      var matches = section && (el.dataset.section === section || el.dataset.sectionAlso === section);
      el.style.display = matches ? '' : 'none';
    });
  }

  categorySelect.addEventListener('change', applyVisibility);
  applyVisibility();
})();
