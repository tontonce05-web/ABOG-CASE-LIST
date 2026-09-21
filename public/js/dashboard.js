(function () {
  var modal = document.getElementById('quick-add-modal');
  if (!modal) return;

  var categoryIdInput = document.getElementById('qa-category-id');
  var categoryNameHeading = document.getElementById('qa-category-name');
  var patientRefInput = document.getElementById('qa-patient-ref');

  document.querySelectorAll('.qa-plus').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var name = btn.getAttribute('data-category-name');
      categoryIdInput.value = btn.getAttribute('data-category-id');
      categoryNameHeading.textContent = 'Add patient — ' + name;
      patientRefInput.value = 'Patient ' + btn.getAttribute('data-next-number');
      modal.showModal();
      patientRefInput.focus();
      patientRefInput.select();
    });
  });

  document.getElementById('qa-close').addEventListener('click', function () {
    modal.close();
  });

  modal.addEventListener('click', function (e) {
    if (e.target === modal) modal.close();
  });
})();
