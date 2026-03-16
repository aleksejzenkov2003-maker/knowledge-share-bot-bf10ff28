

# Admin-Only User Management

## Problem
Currently there's a public `/register` route allowing anyone to sign up. Need to lock down registration so only admins can create users, change passwords, and assign roles.

## Plan

### 1. Remove public registration
- Remove `/register` route from `App.tsx`
- Remove the "Регистрация" link from `Login.tsx`
- Keep `Register.tsx` file but it will be unreachable (or delete it)

### 2. Create edge function `admin-manage-users`
A single edge function that handles admin operations using the Supabase Admin API (service role key):

- **POST /create** -- `supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })` -- creates user with confirmed email, then profile + role are auto-created by the existing `handle_new_user` trigger
- **POST /change-password** -- `supabase.auth.admin.updateUserById(userId, { password })` -- admin resets password for any user
- **POST /delete** -- `supabase.auth.admin.deleteUser(userId)` -- deletes user (cascade cleans profile + role)

All endpoints verify the caller is an admin via their JWT + `user_roles` table check.

### 3. Update Users.tsx page
Add UI elements to the existing Users page:

- **"Создать пользователя" button** -- opens a dialog with fields: full name, email, password, role, department. Calls the edge function to create the user.
- **"Сменить пароль" button** per user row -- opens a dialog to enter new password. Calls the edge function.
- **"Удалить" button** per user row -- confirmation dialog, then calls edge function to delete.

### 4. Disable auto-confirm workaround
Since admin creates users via `auth.admin.createUser` with `email_confirm: true`, users are immediately active without needing email verification. This is correct for admin-managed flow.

### Files to create/modify
- **New**: `supabase/functions/admin-manage-users/index.ts`
- **Edit**: `supabase/config.toml` -- add `[functions.admin-manage-users]` with `verify_jwt = false`
- **Edit**: `src/App.tsx` -- remove `/register` route
- **Edit**: `src/pages/Login.tsx` -- remove registration link
- **Edit**: `src/pages/Users.tsx` -- add create user dialog, change password dialog, delete user button

