import React, { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, X, CheckCircle, XCircle, AlertTriangle, Download, Loader2 } from 'lucide-react';
import { bulkCreateStudents } from '../services/api';
import { useToast } from '../contexts/ToastContext';

// ─── Expected CSV columns ────────────────────────────────────────────────────
const REQUIRED_COLS = ['name', 'email', 'password'];
const OPTIONAL_COLS = ['rollNumber', 'branch', 'section', 'year'];
const ALL_COLS = [...REQUIRED_COLS, ...OPTIONAL_COLS];

// ─── Sample CSV template content ─────────────────────────────────────────────
const CSV_TEMPLATE = `name,email,password,rollNumber,branch,section,year
Rahul Sharma,rahul@college.edu,Pass@123,CSE2021001,CSE,A,2nd Year
Priya Singh,priya@college.edu,Pass@456,CSE2021002,CSE,B,1st Year
Arjun Mehta,arjun@college.edu,Pass@789,CSE2021003,CSE,A,3rd Year`;

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'student_import_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Validate a single row ────────────────────────────────────────────────────
function validateRow(row, idx) {
  const errors = [];
  if (!row.name?.trim()) errors.push('Name is required');
  if (!row.email?.trim() || !/\S+@\S+\.\S+/.test(row.email)) errors.push('Valid email required');
  if (!row.password || row.password.length < 6) errors.push('Password must be ≥ 6 chars');
  return { row: idx + 1, data: row, errors };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BulkImportModal({ onClose, onSuccess }) {
  const toast = useToast();
  const [step, setStep] = useState('upload'); // 'upload' | 'preview' | 'result'
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState([]); // [{ row, data, errors }]
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null); // { created, failed, total }
  const fileRef = useRef(null);

  // ── Parse CSV ──────────────────────────────────────────────────────────────
  const parseCSV = useCallback((text) => {
    const parsed = Papa.parse(text.trim(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, ''),
    });
    // Normalise header names to our expected keys
    const rows = parsed.data.map((raw, i) => {
      const normalized = {
        name: raw.name || raw['studentname'] || raw['fullname'] || '',
        email: raw.email || raw['emailaddress'] || '',
        password: raw.password || raw['pass'] || '',
        rollNumber: raw.rollnumber || raw['roll'] || raw['rollno'] || '',
        branch: raw.branch || raw['dept'] || raw['department'] || '',
        section: raw.section || raw['sec'] || '',
        year: raw.year || raw['academicyear'] || raw['yearofstudying'] || '',
      };
      return validateRow(normalized, i);
    });
    return rows;
  }, []);

  // ── Parse XLSX ─────────────────────────────────────────────────────────────
  const parseXLSX = useCallback((buffer) => {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const rows = raw.map((rawRow, i) => {
      // normalise header case
      const lower = {};
      Object.keys(rawRow).forEach((k) => { lower[k.toLowerCase().replace(/\s+/g, '')] = String(rawRow[k]); });
      const normalized = {
        name: lower.name || lower.studentname || lower.fullname || '',
        email: lower.email || lower.emailaddress || '',
        password: lower.password || lower.pass || '',
        rollNumber: lower.rollnumber || lower.roll || lower.rollno || '',
        branch: lower.branch || lower.dept || lower.department || '',
        section: lower.section || lower.sec || '',
        year: lower.year || lower.academicyear || lower.yearofstudying || '',
      };
      return validateRow(normalized, i);
    });
    return rows;
  }, []);

  // ── Handle file picked ─────────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rows = parseCSV(e.target.result);
        setParsedRows(rows);
        setStep('preview');
      };
      reader.readAsText(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rows = parseXLSX(new Uint8Array(e.target.result));
        setParsedRows(rows);
        setStep('preview');
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error('Please upload a .csv, .xlsx, or .xls file');
    }
  }, [parseCSV, parseXLSX, toast]);

  // ── Drag and drop ──────────────────────────────────────────────────────────
  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);

  // ── Submit import ──────────────────────────────────────────────────────────
  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.errors.length === 0).map((r) => r.data);
    if (validRows.length === 0) {
      toast.warning('No valid rows to import. Please fix the errors shown.');
      return;
    }
    setImporting(true);
    try {
      const res = await bulkCreateStudents(validRows);
      setResult(res);
      setStep('result');
      toast.success(`Import complete: ${res.created.length} added, ${res.failed.length} failed`);
      if (res.created.length > 0 && onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.error || 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r.errors.length === 0).length;
  const errorCount = parsedRows.filter((r) => r.errors.length > 0).length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-700">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Bulk Import Students</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Upload a CSV or Excel file to add multiple students at once</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Drag zone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 scale-[1.01]'
                    : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className={`inline-flex p-4 rounded-2xl mb-4 transition-colors ${isDragging ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                  <Upload className={`w-8 h-8 ${isDragging ? 'text-emerald-600' : 'text-slate-400'}`} />
                </div>
                <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  {isDragging ? 'Drop your file here!' : 'Drag & drop your file here'}
                </p>
                <p className="text-sm text-slate-400 mb-4">or click to browse — supports .csv, .xlsx, .xls</p>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors">
                  <Upload className="w-4 h-4" /> Choose File
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files[0])}
                />
              </div>

              {/* Template download */}
              <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800/50">
                <div>
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">📋 Download CSV Template</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    Use this template to fill in your student data correctly
                  </p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shrink-0"
                >
                  <Download className="w-4 h-4" /> Template
                </button>
              </div>

              {/* Column reference */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Required Columns</p>
                <div className="flex flex-wrap gap-2">
                  {REQUIRED_COLS.map((c) => (
                    <span key={c} className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md text-xs font-mono font-medium">
                      {c} *
                    </span>
                  ))}
                  {OPTIONAL_COLS.map((c) => (
                    <span key={c} className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md text-xs font-mono">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Stats bar */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">📄 {fileName}</span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-500">{parsedRows.length} rows</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle className="w-4 h-4" /> {validCount} valid
                </div>
                {errorCount > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-400">
                    <XCircle className="w-4 h-4" /> {errorCount} with errors (will be skipped)
                  </div>
                )}
              </div>

              {/* Preview table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-10">
                      <tr>
                        <th className="py-2.5 px-3 text-left font-medium text-slate-500 dark:text-slate-400 w-12">#</th>
                        <th className="py-2.5 px-3 text-left font-medium text-slate-500 dark:text-slate-400">Name</th>
                        <th className="py-2.5 px-3 text-left font-medium text-slate-500 dark:text-slate-400">Email</th>
                        <th className="py-2.5 px-3 text-left font-medium text-slate-500 dark:text-slate-400">Roll No.</th>
                        <th className="py-2.5 px-3 text-left font-medium text-slate-500 dark:text-slate-400">Year / Section</th>
                        <th className="py-2.5 px-3 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {parsedRows.map(({ row, data, errors }) => (
                        <tr
                          key={row}
                          className={`${errors.length > 0 ? 'bg-red-50/60 dark:bg-red-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/20'} transition-colors`}
                        >
                          <td className="py-2 px-3 text-slate-400 text-xs">{row}</td>
                          <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-medium">{data.name || <span className="text-red-400 italic">missing</span>}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400 text-xs font-mono">{data.email || <span className="text-red-400 italic">missing</span>}</td>
                          <td className="py-2 px-3 text-slate-500 dark:text-slate-400 text-xs font-mono">{data.rollNumber || '—'}</td>
                          <td className="py-2 px-3 text-slate-500 dark:text-slate-400 text-xs">{data.year ? `${data.year}${data.section ? ` / Sec ${data.section}` : ''}` : data.section || '—'}</td>
                          <td className="py-2 px-3">
                            {errors.length === 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                <CheckCircle className="w-3.5 h-3.5" /> Ready
                              </span>
                            ) : (
                              <div className="space-y-0.5">
                                {errors.map((e, i) => (
                                  <div key={i} className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                                    <AlertTriangle className="w-3 h-3 shrink-0" /> {e}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {errorCount > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/50">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    <span className="font-semibold">{errorCount} row(s) have errors</span> and will be skipped. Only the {validCount} valid rows will be imported.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Result */}
          {step === 'result' && result && (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">{result.total}</p>
                  <p className="text-sm text-slate-500 mt-1">Total Rows</p>
                </div>
                <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{result.created.length}</p>
                  <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-1">✅ Created</p>
                </div>
                <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{result.failed.length}</p>
                  <p className="text-sm text-red-600 dark:text-red-500 mt-1">❌ Failed</p>
                </div>
              </div>

              {/* Created list */}
              {result.created.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500" /> Successfully Created
                  </p>
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
                    {result.created.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-xs text-slate-400 w-6">#{s.row}</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{s.name}</span>
                        <span className="text-slate-400 text-xs ml-auto font-mono">{s.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failed list */}
              {result.failed.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-red-500" /> Failed Rows
                  </p>
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
                    {result.failed.map((s, i) => (
                      <div key={i} className="text-sm">
                        <span className="text-xs text-slate-400 mr-2">Row {s.row}</span>
                        <span className="font-mono text-slate-600 dark:text-slate-400 text-xs mr-2">{s.email}</span>
                        <span className="text-red-600 dark:text-red-400 text-xs">— {s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
          {step === 'upload' && (
            <>
              <p className="text-xs text-slate-400">Max 200 students per import</p>
              <button onClick={onClose} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                Cancel
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => { setStep('upload'); setParsedRows([]); setFileName(''); }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validCount === 0}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-medium rounded-lg hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Import {validCount} Student{validCount !== 1 ? 's' : ''}</>
                )}
              </button>
            </>
          )}

          {step === 'result' && (
            <>
              <p className="text-xs text-slate-400">Import complete</p>
              <button
                onClick={onClose}
                className="px-5 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium rounded-lg hover:shadow-md transition-all"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
