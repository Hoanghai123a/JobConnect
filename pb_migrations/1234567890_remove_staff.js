migrate((app) => {
  // Delete Staff-related collections first
  const collectionsToDelete = [
    "staff_action_logs",
    "factory_managers",
    "recruitment_entities",
    "salary_holds",
    "cccd_versions"
  ];

  collectionsToDelete.forEach(name => {
    try {
      const collection = app.findCollectionByNameOrId(name);
      if (collection) {
        app.delete(collection);
      }
    } catch (e) {
      // Collection doesn't exist, skip
    }
  });

  // Update users collection - restrict roles to admin/user only
  const users = app.findCollectionByNameOrId("users");
  if (users) {
    const roleField = users.fields.find(f => f.name === "role");
    if (roleField && roleField.type === "select") {
      roleField.options.values = ["admin", "user"];
    }
    app.save(users);
  }

  // Update advances collection - remove recruiter fields
  const advances = app.findCollectionByNameOrId("advances");
  if (advances) {
    // Remove recruiter-related fields
    const fieldsToRemove = ["recruiter_id", "recruiter_staff", "recruiter_partner", "recruiter_note"];
    advances.fields = advances.fields.filter(f => !fieldsToRemove.includes(f.name));

    // Update status field to only include: pending, accepted, rejected
    const statusField = advances.fields.find(f => f.name === "status");
    if (statusField && statusField.type === "select") {
      statusField.options.values = ["pending", "accepted", "rejected"];
    }

    app.save(advances);
  }

}, (app) => {
  // Rollback - recreate deleted collections with basic structure
  // This is a simplified rollback - full restoration requires backup

  // Restore users role field
  const users = app.findCollectionByNameOrId("users");
  if (users) {
    const roleField = users.fields.find(f => f.name === "role");
    if (roleField && roleField.type === "select") {
      roleField.options.values = ["admin", "staff", "user"];
    }
    app.save(users);
  }

  // Restore advances status field
  const advances = app.findCollectionByNameOrId("advances");
  if (advances) {
    const statusField = advances.fields.find(f => f.name === "status");
    if (statusField && statusField.type === "select") {
      statusField.options.values = ["pending", "recruiter_approved", "accepted", "rejected"];
    }
    app.save(advances);
  }
})
