export interface UserRecord {
  id: string;
  name: string;
  email: string;
}

export const usersTable = {
  name: 'users',
  primaryKey: 'id',
};

export function getDbConnection(): { status: string } {
  return { status: 'connected' };
}
