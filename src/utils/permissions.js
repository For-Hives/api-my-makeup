"use strict";

/**
 * Applies config/permissions.js to the Public and Authenticated roles.
 */

const ROLE_UID = "plugin::users-permissions.role";
const PERMISSION_UID = "plugin::users-permissions.permission";
const ROLE_TYPES = ["public", "authenticated"];

/**
 * Compares the permission rows of a role with the actions it must have.
 *
 * @param {{ id: number, action: string }[]} rows - Current rows of the role
 * @param {string[]} wanted - Actions the role must have, and nothing else
 * @returns {{ toAdd: string[], toRemove: { id: number, action: string }[] }}
 *   Actions to create, and rows to delete (actions not wanted, duplicates)
 */
const diffPermissions = (rows, wanted) => {
  const wantedActions = new Set(wanted);
  const kept = new Set();
  const toRemove = [];

  for (const row of rows) {
    if (wantedActions.has(row.action) && !kept.has(row.action)) {
      kept.add(row.action);
    } else {
      toRemove.push(row);
    }
  }

  const toAdd = [...wantedActions].filter((action) => !kept.has(action));

  return { toAdd, toRemove };
};

/**
 * Lists every content API action, built like users-permissions builds it
 * for its admin screen: `<api|plugin>::<name>.<controller>.<action>`.
 */
const contentApiActions = (strapi) => {
  const actionsOf = (prefix, modules) =>
    Object.entries(modules).flatMap(([moduleName, module]) =>
      Object.entries(module.controllers ?? {}).flatMap(
        ([controllerName, controller]) =>
          Object.keys(controller).map(
            (action) => `${prefix}::${moduleName}.${controllerName}.${action}`
          )
      )
    );

  return [
    ...actionsOf("api", strapi.api),
    ...actionsOf("plugin", strapi.plugins),
  ];
};

const describeChanges = (type, wanted, toAdd, toRemove) => {
  const changes = [
    ...toAdd.map((action) => `+${action}`),
    ...toRemove.map((row) =>
      wanted.includes(row.action)
        ? `-${row.action} (duplicate)`
        : `-${row.action}`
    ),
  ];
  return `${type}: ${wanted.length} actions, ${toAdd.length} added, ${
    toRemove.length
  } removed${changes.length > 0 ? ` (${changes.join(" ")})` : ""}`;
};

/**
 * Makes the Public and Authenticated permissions equal to `wantedByRole`,
 * in one transaction, and logs a summary (role names and actions only).
 * Throws before writing anything if an action does not exist.
 *
 * @param {object} strapi
 * @param {{ public: string[], authenticated: string[] }} wantedByRole
 */
const syncRolePermissions = async (strapi, wantedByRole) => {
  const known = new Set(contentApiActions(strapi));
  const unknown = ROLE_TYPES.flatMap((type) => wantedByRole[type] ?? []).filter(
    (action) => !known.has(action)
  );

  if (unknown.length > 0) {
    throw new Error(
      `config/permissions.js lists unknown actions: ${unknown.join(", ")}`
    );
  }

  const summary = await strapi.db.transaction(async () => {
    const lines = [];

    for (const type of ROLE_TYPES) {
      const wanted = wantedByRole[type] ?? [];
      const role = await strapi.query(ROLE_UID).findOne({ where: { type } });

      if (!role) {
        throw new Error(`users-permissions role "${type}" not found`);
      }

      const rows = await strapi.query(PERMISSION_UID).findMany({
        select: ["id", "action"],
        where: { role: { id: role.id } },
      });
      const { toAdd, toRemove } = diffPermissions(rows, wanted);

      if (toRemove.length > 0) {
        await strapi.query(PERMISSION_UID).deleteMany({
          where: { id: { $in: toRemove.map((row) => row.id) } },
        });
      }

      for (const action of toAdd) {
        await strapi
          .query(PERMISSION_UID)
          .create({ data: { action, role: role.id } });
      }

      lines.push(describeChanges(type, wanted, toAdd, toRemove));
    }

    return lines;
  });

  strapi.log.info(`[permissions] ${summary.join("; ")}`);
};

module.exports = {
  ROLE_TYPES,
  contentApiActions,
  diffPermissions,
  syncRolePermissions,
};
