// https://plugins-doc.logseq.com/
const settings = [
  {
    key: "settings",
    title: "Settings",
    type: "heading",
  },
  {
    key: "keyword",
    title: "Log keyword",
    type: "string",
    default: "## Log",
  },
  {
    key: "nest",
    title: "Log nest",
    type: "number",
    default: 1,
  },
];

function tagMatch(name) {
  const m = name.match(/^\d{3}$/);
  return m ? m[0] : undefined;
}

function main() {
  logseq.useSettingsSchema(settings);

  logseq.Editor.registerSlashCommand("Insert Journal Summary", async () => {
    await logseq.Editor.insertAtEditingCursor("{{renderer journal-summary}}");
  });

  logseq.provideModel({
    jumpTag(e) {
      logseq.App.pushState("page", {
        name: e.dataset.ref,
      });
    },
  });

  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    const [type] = payload.arguments;
    const uuid = payload.uuid;

    if (type === "journal-summary") {
      const block = await logseq.Editor.getBlock(uuid);
      const page = await logseq.Editor.getPage(block.page.id);
      const tree = await logseq.Editor.getPageBlocksTree(page.uuid);

      const [node] = tree.filter((t) => t.content === logseq.settings.keyword);

      try {
        if (!node) {
          throw new Error(`"${logseq.settings.keyword}" not exist`);
        }

        var children = node.children;
        for (let i = 0; i < logseq.settings.nest; i++) {
          children = children.map((child) => child.children).flat();
        }

        const contents = await Promise.all(
          children.map(async (child) => {
            const times = child.content.match(
              /(?<start>\d{2}:\d{2})\s*-\s*(?<end>\d{2}:\d{2})/
            );
            if (!times) {
              return undefined;
            }

            const start = times.groups.start.split(":");
            const end = times.groups.end.split(":");

            const elapsed =
              parseInt(end[0]) * 60 +
              parseInt(end[1]) -
              (parseInt(start[0]) * 60 + parseInt(start[1]));

            let tag = undefined;
            let refTag = undefined;
            for (let i = 0; i < child.pathRefs.length; i++) {
              const ref = await logseq.Editor.getPage(child.pathRefs[i].id);
              tag = tag || tagMatch(ref.name);

              if (ref.properties) {
                ref.properties.tags.forEach((t) => {
                  refTag = refTag || tagMatch(t);
                });
              }
            }
            tag = tag || refTag;
            if (!tag) {
              console.warn(child);
              child.pathRefs.forEach(async (pathRef) => {
                const ref = await logseq.Editor.getPage(pathRef.id);
                console.warn(pathRef, ref);
              });
              tag = child.content;
            }

            return {
              tag,
              elapsed: elapsed / 60,
            };
          })
        );

        const agg = Object.entries(
          contents
            .filter((c) => c !== undefined)
            .reduce((acc, { tag, elapsed }) => {
              acc[tag] = (acc[tag] || 0) + elapsed;
              return acc;
            }, {})
        );

        agg.sort((a, b) => (a[0] > b[0] ? 1 : -1));

        let rows = agg
          .map(
            (r) => `
              <tr>
                <td><a data-on-click="jumpTag" data-ref="${r[0]}" class="tag">${r[0]}</a></td>
                <td>${r[1]}</td>
              </tr>`
          )
          .join("");

        rows += `
          <tfoot>
            <tr>
              <td><b>Total</b></td>
              <td><b>${agg
                .map((a) => a[1])
                .reduce((acc, a) => acc + a)}</b></td>
            </tr>
          </tfoot>
        `;

        logseq.provideUI({
          template: `
            <table data-slot-id="${slot}" data-block-uuid="${uuid}">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
            `,
          key: `journal-summary-${slot}`,
          slot: slot,
          reset: true,
        });
      } catch (e) {
        logseq.provideUI({
          key: `journal-summary-${slot}`,
          template: `<div data-slot-id="${slot}" data-block-uuid="${uuid}">${e}</div>`,
          slot: slot,
          reset: true,
        });
      }
    }
  });
}

// bootstrap
logseq.ready().then(main).catch(console.error);
