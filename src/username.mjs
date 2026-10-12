export function normalizeUsername(value) {
  const name = String(value ?? '').trim().toLowerCase();
<<<<<<< HEAD
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(name)) {
    throw new Error('El usuario debe tener entre 3 y 40 caracteres: letras sin tildes, números, punto, guion o guion bajo.');
  }
  return name;
}
export const usernameEmail = value => `${normalizeUsername(value)}@usuarios.jupa.invalid`;
=======

  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(name)) {
    throw new Error(
      'El usuario debe tener entre 3 y 40 caracteres: letras sin tildes, números, punto, guion o guion bajo.'
    );
  }

  return name;
}

export const usernameEmail = value =>
  `${normalizeUsername(value)}@usuarios.jupa.invalid`;
>>>>>>> 89f3d9f415794ca52e8ee5a6263934e4e6cb42d6
