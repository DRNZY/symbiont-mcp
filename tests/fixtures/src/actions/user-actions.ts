export type UserResponse = { success: boolean; data: string };

export async function createUser(name: string): Promise<UserResponse> {
  return { success: true, data: `User ${name} created` };
}

export async function getZodUser(): Promise<string> {
  return "not-zod";
}
