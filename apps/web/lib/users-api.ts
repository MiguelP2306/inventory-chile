import type { UserRole } from '@inventory/shared';
import { api } from './api';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListUsersParams {
  q?: string;
  role?: UserRole;
}

export const listUsers = (params: ListUsersParams = {}) =>
  api.get<UserDto[]>('/users', { params }).then((r) => r.data);

export const getUser = (id: string) =>
  api.get<UserDto>(`/users/${id}`).then((r) => r.data);

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export const createUser = (input: CreateUserInput) =>
  api.post<UserDto>('/users', input).then((r) => r.data);

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
}

export const updateUser = (id: string, input: UpdateUserInput) =>
  api.patch<UserDto>(`/users/${id}`, input).then((r) => r.data);

export const resetUserPassword = (id: string, newPassword: string) =>
  api
    .patch<{ ok: true }>(`/users/${id}/password`, { newPassword })
    .then((r) => r.data);

export const changeOwnPassword = (
  currentPassword: string,
  newPassword: string,
) =>
  api
    .patch<{ ok: true }>('/users/me/password', { currentPassword, newPassword })
    .then((r) => r.data);
