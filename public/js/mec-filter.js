(function () {
  var input = document.getElementById('mec-search-input');
  var table = document.getElementById('mec-table');
  var noResults = document.getElementById('mec-no-results');
  if (!input || !table) return;

  var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));

  function applyFilter() {
    var q = input.value.trim().toLowerCase();
    var visibleCount = 0;
    var currentGroup = null;
    var currentGroupHasMatch = false;

    rows.forEach(function (row) {
      if (row.classList.contains('mec-group-row')) {
        if (currentGroup) currentGroup.style.display = currentGroupHasMatch ? '' : 'none';
        currentGroup = row;
        currentGroupHasMatch = false;
        return;
      }
      var condition = row.getAttribute('data-condition') || '';
      var match = q === '' || condition.indexOf(q) !== -1;
      row.style.display = match ? '' : 'none';
      if (match) {
        visibleCount++;
        currentGroupHasMatch = true;
      }
    });
    if (currentGroup) currentGroup.style.display = currentGroupHasMatch ? '' : 'none';

    if (noResults) noResults.style.display = visibleCount === 0 ? '' : 'none';
  }

  input.addEventListener('input', applyFilter);
})();
