let pageLanguageCode = "fr";

export function setGoogleTranslatePageLanguage(code: string): void {
  pageLanguageCode = code;
}

export function getGoogleTranslatePageLanguage(): string {
  return pageLanguageCode;
}
