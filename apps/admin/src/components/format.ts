// How the admin writes dates.

const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));
