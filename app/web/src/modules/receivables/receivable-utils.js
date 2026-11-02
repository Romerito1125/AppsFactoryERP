export const clientDisplayName = (client) =>
  client
    ? (client.name ??
      ([client.firstName, client.lastName].filter(Boolean).join(" ") ||
        `Cliente #${client.id}`))
    : "";
