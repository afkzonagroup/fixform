// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: Apache-2.0

import '/fixform/component/define.js';

const form = document.querySelector('repair-form');
const status = document.getElementById('status');
const email = document.getElementById('consumer-email');

form.addEventListener('repair-form-submit', async (event) => {
  status.textContent = '';
  if (!email.checkValidity() || email.value === '') {
    status.textContent = 'Enter the consumer e-mail address.';
    email.focus();
    return;
  }
  const response = await fetch('/repair-forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ form: event.detail.form, consumerEmail: email.value }),
  });
  const body = await response.json();
  status.textContent = response.ok ? `Form ${body.id} sent. Valid until the end of ${body.lastDay}.` : `Not sent (${body.error}).`;
});
