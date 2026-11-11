(function () {
  function normalizeQuotes(value) {
    return value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  }

  function normalizeSpacing(value) {
    const text = normalizeQuotes(value.trim());
    let output = '';
    let quote = '';
    let escaped = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quote) {
        output += char;
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        output += char;
      } else if (/\s/.test(char)) {
        let next = index + 1;
        while (next < text.length && /\s/.test(text[next])) next += 1;
        const previousChar = output[output.length - 1] || '';
        const nextChar = text[next] || '';
        if (/[A-Za-z0-9_]/.test(previousChar) && /[A-Za-z0-9_]/.test(nextChar)) output += ' ';
        index = next - 1;
      } else {
        output += char;
      }
    }
    return output;
  }

  function unmatchedBracket(value) {
    const pairs = { ')': '(', ']': '[', '}': '{' };
    const stack = [];
    let quote = '';
    let escaped = false;
    for (const char of normalizeQuotes(value)) {
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '(' || char === '[' || char === '{') {
        stack.push(char);
      } else if (pairs[char]) {
        if (stack.pop() !== pairs[char]) return true;
      }
    }
    return stack.length > 0;
  }

  function diagnose(typed, expected) {
    const raw = String(typed || '').trim();
    const wanted = String(expected || '').trim();
    const normalized = normalizeQuotes(raw);
    if (normalizeSpacing(normalized) === normalizeSpacing(wanted)) {
      const notes = [];
      if (/[“”‘’]/.test(raw)) notes.push('Curly quotes work here; Python code normally uses straight quotes.');
      if (normalized !== wanted) notes.push('Your spacing is valid. Python style usually spaces operators and commas neatly.');
      return notes.join(' ');
    }

    const quoteCount = (normalized.match(/["']/g) || []).length;
    if (quoteCount % 2 === 1) return 'Looks like a closing quote is missing. Strings need a matching pair of quotes.';
    if (unmatchedBracket(normalized)) return 'One of the brackets is missing or does not match. Check each opening ( or [ for its partner.';
    if (wanted.endsWith(':') && normalizeSpacing(normalized) === normalizeSpacing(wanted.slice(0, -1))) {
      return 'Almost there: this Python line needs a colon (:) at the end.';
    }
    if (quoteCount !== (wanted.match(/["']/g) || []).length) {
      return 'Check the quotes. They tell Python whether this is text or a value such as a variable or number.';
    }
    if (normalized.toLowerCase() === wanted.toLowerCase()) return 'The spelling is close, but Python is case-sensitive. Check uppercase and lowercase letters.';
    const compactTyped = normalizeSpacing(normalized);
    const compactWanted = normalizeSpacing(wanted);
    if (compactTyped.startsWith(compactWanted)) return 'You have the right start, plus a little extra. Remove the extra characters at the end.';
    if (compactWanted.startsWith(compactTyped)) return 'You are nearly there. Check for a missing character at the end.';
    return 'Not quite yet. Compare the quotes, brackets, spelling, and punctuation with the example.';
  }

  function matches(typed, expected) {
    return normalizeSpacing(String(typed || '')) === normalizeSpacing(String(expected || ''));
  }

  window.LacunaValidate = { diagnose, matches, normalizeQuotes, normalizeSpacing };
})();
