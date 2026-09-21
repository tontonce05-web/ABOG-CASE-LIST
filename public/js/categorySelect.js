(function () {
  function setup(sectionSelect, categorySelect, wrapper) {
    if (!sectionSelect || !categorySelect) return;
    var optgroups = categorySelect.querySelectorAll('optgroup');

    function applyFilter() {
      var section = sectionSelect.value;
      optgroups.forEach(function (g) {
        g.hidden = section !== '' && g.label !== section;
      });
      if (wrapper) wrapper.style.display = section ? '' : 'none';
    }

    // Edit mode (or a reloaded filter) already has a category selected —
    // default the section select to match it so the right group shows.
    var preselected = categorySelect.options[categorySelect.selectedIndex];
    if (preselected && preselected.dataset.section) {
      sectionSelect.value = preselected.dataset.section;
    }

    sectionSelect.addEventListener('change', function () {
      categorySelect.value = '';
      // Programmatic value changes don't fire 'change' — dispatch one so
      // any other listener on this select (e.g. the OB/Gyn/Office-specific
      // field toggling on the add-case form) re-evaluates too.
      categorySelect.dispatchEvent(new Event('change'));
      applyFilter();
    });

    applyFilter();
  }

  setup(
    document.getElementById('section_select'),
    document.getElementById('category_id'),
    document.getElementById('category_field_group')
  );
  setup(
    document.getElementById('filter_section_select'),
    document.getElementById('filter_category_select'),
    document.getElementById('filter_category_wrapper')
  );
})();
