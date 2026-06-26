/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-cycles",
      severity: "error",
      from: {},
      to: {
        circular: true
      }
    },
    {
      name: "web-must-not-import-other-apps",
      severity: "error",
      from: {
        path: "^apps/web/"
      },
      to: {
        path: "^apps/(extension|share-server)/"
      }
    },
    {
      name: "extension-must-not-import-other-apps",
      severity: "error",
      from: {
        path: "^apps/extension/"
      },
      to: {
        path: "^apps/(web|share-server)/"
      }
    },
    {
      name: "share-server-must-not-import-other-apps",
      severity: "error",
      from: {
        path: "^apps/share-server/"
      },
      to: {
        path: "^apps/(web|extension)/"
      }
    },
    {
      name: "contracts-is-leaf",
      severity: "error",
      from: {
        path: "^packages/contracts/"
      },
      to: {
        path: "^packages/(?!contracts/)"
      }
    },
    {
      name: "server-isolation",
      severity: "error",
      from: {
        path: "^apps/share-server/"
      },
      to: {
        path: "^packages/(?!contracts/)"
      }
    },
    {
      name: "domain-is-platform-agnostic",
      severity: "error",
      from: {
        path: "^packages/(core|store|retrieval|export|render)/"
      },
      to: {
        path: "^(apps/|node:|react$|react-dom|wxt$)"
      }
    },
    {
      name: "dom-only-in-adapters",
      severity: "error",
      from: {
        path: "^packages/core/"
      },
      to: {
        path: "^packages/site-adapters/"
      }
    }
  ],
  options: {
    doNotFollow: {
      path: "node_modules"
    },
    exclude: {
      path: "(^|/)(dist|dist-types|coverage|\\.turbo|\\.wxt)(/|$)"
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.base.json"
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "default", "types"]
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/[^/]+"
      }
    }
  }
};
