/**
 * Stub file for UserPicker - workforce functionality removed
 */

export function normalizeUserPickerSearch(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function UserPicker() {
  return null;
}

export function FactoryPicker() {
  return null;
}

export default UserPicker;
