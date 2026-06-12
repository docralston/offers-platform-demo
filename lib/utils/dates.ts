/**
 * Date utilities for Eastern Time (US) with daylight savings support
 * Uses America/New_York timezone which automatically handles DST
 */

const EASTERN_TIMEZONE = 'America/New_York';

/**
 * Format a date as a date string in Eastern Time (YYYY-MM-DD)
 * @param date - Date to format (Date object or ISO string)
 * @returns Date string in YYYY-MM-DD format as it appears in Eastern Time
 */
export function formatEasternDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const parts = formatter.formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  
  return `${year}-${month}-${day}`;
}

/**
 * Format a date as a localized date string in Eastern Time
 * @param date - Date to format (Date object or ISO string)
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string
 */
export function formatEasternDateString(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    timeZone: EASTERN_TIMEZONE,
    ...options,
  });
}

/**
 * Format a date and time as a localized string in Eastern Time
 * @param date - Date to format (Date object or ISO string)
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date/time string
 */
export function formatEasternDateTime(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    timeZone: EASTERN_TIMEZONE,
    ...options,
  });
}

/**
 * Format timestamp app-wide as `M/D/YY h:mma` in Eastern Time.
 * Example: 3/19/26 4:11pm
 */
export function formatAppTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIMEZONE,
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);

  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const dayPeriod = (parts.find((p) => p.type === 'dayPeriod')?.value ?? '').toLowerCase();

  return `${month}/${day}/${year} ${hour}:${minute}${dayPeriod}`;
}

/**
 * Create a Date object representing midnight Eastern Time for a given date string (YYYY-MM-DD)
 * This function interprets the date string as a date in Eastern Time and returns
 * the UTC Date object that represents midnight Eastern Time for that date.
 * 
 * @param dateString - Date string in YYYY-MM-DD format (interpreted as Eastern Time)
 * @returns Date object (stored as UTC) representing midnight Eastern Time for that date
 */
export function createEasternDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  
  // Find the UTC time that corresponds to midnight Eastern on this date
  // We'll use a binary search approach to find the exact UTC time
  const targetDateStr = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  // Start with a reasonable range: 4-6 AM UTC typically covers midnight Eastern
  let low = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
  let high = new Date(Date.UTC(year, month - 1, day, 7, 0, 0));
  
  // Binary search for midnight Eastern
  for (let i = 0; i < 30; i++) {
    const mid = new Date((low.getTime() + high.getTime()) / 2);
    const midDateStr = dateFormatter.format(mid);
    const midTimeStr = timeFormatter.format(mid);
    const [midHour, midMin, midSec] = midTimeStr.split(':').map(Number);
    
    if (midDateStr === targetDateStr && midHour === 0 && midMin === 0 && midSec === 0) {
      return mid;
    }
    
    if (midDateStr < targetDateStr || (midDateStr === targetDateStr && midHour > 0)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  
  // If binary search didn't converge, use the midpoint
  return new Date((low.getTime() + high.getTime()) / 2);
}
