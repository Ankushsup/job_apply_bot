/**
 * Smart Resume Form Auto-Filler (React / Angular / Workday / Greenhouse / Naukri compatible)
 */
(function () {
  window.__ankushAutoFill = function (profile) {
    if (!profile) return { filled: 0 };

    const setNativeValue = (el, val) => {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : el.tagName === 'SELECT'
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    };

    const getFieldContext = (el) => {
      const id = el.id || '';
      let labelText = '';
      if (id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lbl) labelText = lbl.innerText;
      }
      if (!labelText) {
        const parentLbl = el.closest('label');
        if (parentLbl) labelText = parentLbl.innerText;
      }
      if (!labelText) {
        const container = el.closest('.field, .form-group, .application-question, [role="listitem"], div');
        if (container) {
          const heading = container.querySelector('label, .label, [role="heading"], span');
          if (heading) labelText = heading.innerText;
        }
      }
      return [
        el.name || '',
        el.id || '',
        el.placeholder || '',
        el.getAttribute('aria-label') || '',
        el.getAttribute('autocomplete') || '',
        labelText || ''
      ].join(' ').toLowerCase().replace(/\s+/g, ' ');
    };

    const matchValue = (ctx, tagName, type) => {
      if (type === 'hidden' || type === 'file' || type === 'submit' || type === 'button' || type === 'checkbox' || type === 'radio') {
        return null;
      }

      if (/\bfirst.?name\b|\bfname\b|\bgiven.?name\b/.test(ctx)) return profile.firstName;
      if (/\blast.?name\b|\blname\b|\bsurname\b|\bfamily.?name\b/.test(ctx)) return profile.lastName;
      if (/\bfull.?name\b|\byour name\b|\bcandidate name\b|\bname\b/.test(ctx) && !/company|college|university|school|project|user/.test(ctx)) {
        return profile.fullName;
      }
      if (/\bemail\b|\be-mail\b/.test(ctx) || type === 'email') return profile.email;
      if (/\bphone\b|\bmobile\b|\bcontact.?number\b|\bwhatsapp\b|\btel\b/.test(ctx) || type === 'tel') {
        return ctx.includes('10') || ctx.includes('digit') ? profile.phoneDigits : profile.phone;
      }
      if (/\blinkedin\b/.test(ctx)) return profile.linkedin;
      if (/\bgithub\b/.test(ctx)) return profile.github;
      if (/\bportfolio\b|\bwebsite\b|\bpersonal site\b/.test(ctx)) return profile.portfolio || profile.github;
      if (/\bcurrent.?ctc\b|\bcurrent.?salary\b|\bcurrent.?compensation\b/.test(ctx)) {
        return /number|num|amount|inr/.test(ctx) ? profile.currentCtcNum : profile.currentCtc;
      }
      if (/\bexpected.?ctc\b|\bexpected.?salary\b|\bdesired.?salary\b|\bexpected.?compensation\b|\bsalary\b|\bctc\b/.test(ctx)) {
        return /number|num|amount|inr/.test(ctx) ? profile.expectedCtcNum : profile.expectedCtc;
      }
      if (/\bnotice\b|\bavailability\b|\bjoin\b/.test(ctx)) {
        return /day|number/.test(ctx) ? String(profile.noticePeriodDays || '0') : profile.noticePeriod;
      }
      if (/\bexperience\b|\byoe\b|\byears of\b|\btotal exp\b/.test(ctx)) {
        return String(profile.experienceYears || '3.5');
      }
      if (/\bcurrent.?company\b|\bemployer\b|\borganization\b/.test(ctx)) return profile.currentCompany;
      if (/\bcurrent.?title\b|\bcurrent.?role\b|\bdesignation\b|\bheadline\b/.test(ctx)) return profile.currentTitle;
      if (/\bcity\b|\bcurrent.?location\b|\blocation\b|\baddress\b/.test(ctx)) {
        return /\bcity\b/.test(ctx) ? profile.city : profile.location;
      }
      if (/\bdegree\b|\bqualification\b/.test(ctx)) return profile.degree;
      if (/\buniversity\b|\bcollege\b|\binstitute\b|\bschool\b/.test(ctx)) return profile.university;
      if (/\bskills\b|\btech stack\b|\btechnologies\b/.test(ctx)) {
        return Array.isArray(profile.skills) ? profile.skills.join(', ') : '';
      }
      if (tagName === 'TEXTAREA' && /\b(cover|summary|about|why|pitch|bio|note|additional|message)\b/.test(ctx)) {
        return profile.summary;
      }
      return null;
    };

    let filledCount = 0;
    const elements = document.querySelectorAll('input, textarea, select');

    elements.forEach((el) => {
      if (el.disabled || el.readOnly) return;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;

      const ctx = getFieldContext(el);
      const val = matchValue(ctx, el.tagName, (el.type || '').toLowerCase());
      if (!val) return;

      if (el.tagName === 'SELECT') {
        const lowerVal = String(val).toLowerCase();
        const opt = Array.from(el.options).find(o =>
          o.text.toLowerCase().includes(lowerVal) || o.value.toLowerCase().includes(lowerVal)
        );
        if (opt) {
          setNativeValue(el, opt.value);
          el.style.outline = '2px solid #10b981';
          filledCount++;
        }
      } else if (!el.value || el.value.trim() === '') {
        setNativeValue(el, val);
        el.style.outline = '2px solid #10b981';
        el.style.backgroundColor = '#f0fdf4';
        filledCount++;
      }
    });

    return { filled: filledCount };
  };
})();

