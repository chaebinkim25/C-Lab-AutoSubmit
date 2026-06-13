// src/utils/time.ts

export let extensionStartTime = Date.now();

export function resetExtensionStartTime() {
    extensionStartTime = Date.now();
}

export function getKSTISO8601(): string {
    const now = new Date();
    // Force a 9-hour offset for KST (Asia/Seoul)
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + kstOffset);

    const pad = (n: number) => n.toString().padStart(2, '0');

    const year = kstDate.getFullYear();
    const month = pad(kstDate.getMonth() + 1);
    const day = pad(kstDate.getDate());
    const hours = pad(kstDate.getHours());
    const minutes = pad(kstDate.getMinutes());
    const seconds = pad(kstDate.getSeconds());

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+09:00`;
}
