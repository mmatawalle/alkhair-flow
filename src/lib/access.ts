export type AppRole = "super_admin" | "staff";

export function getAccessFlags(roles: AppRole[]) {
  const isSuperAdmin = roles.includes("super_admin");
  const isStaff = roles.includes("staff") && !isSuperAdmin;

  return { isSuperAdmin, isStaff };
}
