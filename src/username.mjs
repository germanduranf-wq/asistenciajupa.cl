export function normalizeUsername(value) {
  const name = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(name)) {
    throw new Error('El usuario debe tener entre 3 y 40 caracteres: letras sin tildes, números, punto, guion o guion bajo.');
  }
  return name;
}
export const usernameEmail = value => `${normalizeUsername(value)}@usuarios.jupa.invalid`;
