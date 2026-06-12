'use client';

import { useState } from 'react';

export function ViewSnapshotButton({ snapshot, versionNumber }: { snapshot: any; versionNumber: number }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
      >
        View Snapshot
      </button>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[80vh] max-w-4xl overflow-auto rounded-lg bg-white p-6 dark:bg-gray-800 dark:ring-1 dark:ring-gray-700">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Version {versionNumber} Snapshot</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Close
              </button>
            </div>
            <pre className="overflow-auto rounded bg-gray-100 p-4 text-xs dark:bg-gray-700 dark:text-gray-200">
              {JSON.stringify(snapshot, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
