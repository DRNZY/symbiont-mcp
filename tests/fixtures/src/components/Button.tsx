import React from 'react';
import { usersTable, getDbConnection } from '../server/db/schema.js';

export interface ButtonProps {
  label: string;
  onClick?: () => void;
}

/**
 * Primary UI button component
 */
export function Button({ label, onClick }: ButtonProps): JSX.Element {
  const db = getDbConnection();
  return (
    <button onClick={onClick} data-db={usersTable.name}>
      {label} ({db.status})
    </button>
  );
}
