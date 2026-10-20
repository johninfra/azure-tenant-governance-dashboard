export function csvCell(value = '') {
  let text = String(value ?? '');
  if (/^[\t\r\n]|^\s*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function findingsCsv(findings, { complete, score, available, total, snapshotAt }) {
  const status = complete ? 'Complete evidence; heuristic only' : 'Incomplete; score withheld';
  const metadata = ['info', 'Assessment evidence', '', `${available}/${total} datasets available. MFA enforcement is unknown.`,
    'assessment', status, score, snapshotAt];
  const rows = [['severity', 'title', 'subject', 'detail', 'recordType', 'assessmentStatus', 'reviewScore', 'snapshotAt'], metadata,
    ...findings.map(finding => [finding.severity, finding.title, finding.subject, finding.detail, 'finding', status, score, snapshotAt])];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
