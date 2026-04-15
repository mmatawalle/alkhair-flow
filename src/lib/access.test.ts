import { describe, expect, it } from "vitest";
import { getAccessFlags } from "./access";

describe("getAccessFlags", () => {
  it("limits explicitly staff accounts", () => {
    expect(getAccessFlags(["staff"])).toEqual({
      isSuperAdmin: false,
      isStaff: true,
    });
  });

  it("keeps super admins in the full admin experience", () => {
    expect(getAccessFlags(["super_admin"])).toEqual({
      isSuperAdmin: true,
      isStaff: false,
    });
  });

  it("does not downgrade super admins even if staff is also present", () => {
    expect(getAccessFlags(["staff", "super_admin"])).toEqual({
      isSuperAdmin: true,
      isStaff: false,
    });
  });
});
