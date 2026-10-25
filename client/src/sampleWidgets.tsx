import type { UINode } from "./DynamicUI";

export const SAMPLE_WIDGETS: UINode[] = [
  {
    "type": "Container",
    "state": {
      "power": true,
      "temperature": 21,
      "mode": "Eco"
    },
    "layout": {
      "direction": "column",
      "gap": "md"
    },
    "children": [
      {
        "type": "WidgetHeader",
        "props": {
          "title": "Living Room Pod",
          "subtitle": "HVAC • Climate Automation"
        }
      },
      {
        "type": "Container",
        "layout": {
          "direction": "row",
          "justify": "between",
          "align": "center"
        },
        "children": [
          {
            "type": "Switch",
            "bind": "power",
            "props": {
              "label": "Master Power"
            }
          },
          {
            "type": "Badge",
            "props": {
              "label": "{{temperature}}°C",
              "variant": "primary"
            }
          }
        ]
      },
      {
        "type": "SegmentedControl",
        "bind": "mode",
        "props": {
          "options": ["Cool", "Heat", "Eco", "Quiet"]
        }
      },
      {
        "type": "Divider"
      },
      {
        "type": "Container",
        "layout": {
          "direction": "row",
          "gap": "sm",
          "align": "center",
          "justify": "between"
        },
        "children": [
          {
            "type": "Button",
            "props": {
              "label": "-1°",
              "variant": "outline",
              "iconName": "minus"
            },
            "action": {
              "type": "decrement",
              "target": "temperature",
              "value": 1
            }
          },
          {
            "type": "ElasticSlider",
            "bind": "temperature",
            "props": {
              "min": 16,
              "max": 30,
              "label": "Target Temp"
            }
          },
          {
            "type": "Button",
            "props": {
              "label": "+1°",
              "variant": "outline",
              "iconName": "plus"
            },
            "action": {
              "type": "increment",
              "target": "temperature",
              "value": 1
            }
          }
        ]
      }
    ]
  },

  {
    "type": "Container",
    "state": {
      "sessionType": "Deep Work",
      "progressPct": 65,
      "completedRounds": 3
    },
    "layout": {
      "direction": "column",
      "gap": "md"
    },
    "children": [
      {
        "type": "WidgetHeader",
        "props": {
          "title": "Focus Sprint",
          "subtitle": "25-minute block • Round {{completedRounds}} of 4"
        }
      },
      {
        "type": "Container",
        "layout": {
          "direction": "row",
          "justify": "between",
          "align": "center"
        },
        "children": [
          {
            "type": "Badge",
            "props": {
              "label": "Active: {{sessionType}}",
              "variant": "primary"
            }
          },
          {
            "type": "Badge",
            "props": {
              "label": "🔥 3 Day Streak",
              "variant": "secondary"
            }
          }
        ]
      },
      {
        "type": "Progress",
        "props": {
          "value": 65
        }
      },
      {
        "type": "SegmentedControl",
        "bind": "sessionType",
        "props": {
          "options": ["Deep Work", "Short Rest", "Brainstorm"]
        }
      },
      {
        "type": "ExpandableText",
        "props": {
          "text": "Goal for this sprint: Finalize design system tokens and review PR #302. Avoid switching browser tabs until the timer dings."
        }
      },
      {
        "type": "Divider"
      },
      {
        "type": "Container",
        "layout": {
          "direction": "row",
          "justify": "between",
          "gap": "sm"
        },
        "children": [
          {
            "type": "Button",
            "props": {
              "label": "Complete Sprint",
              "variant": "primary"
            },
            "action": {
              "type": "increment",
              "target": "completedRounds",
              "value": 1
            }
          },
          {
            "type": "HoldToConfirm",
            "props": {
              "label": "Hold to Cancel",
              "variant": "destructive"
            },
            "action": {
              "type": "set",
              "target": "progressPct",
              "value": 0
            }
          }
        ]
      }
    ]
  },

  {
    "type": "Container",
    "state": {
      "trafficAllocation": 50,
      "maintenanceMode": true,
      "canaryHealth": 4
    },
    "layout": {
      "direction": "column",
      "gap": "md"
    },
    "children": [
      {
        "type": "WidgetHeader",
        "props": {
          "title": "Incident Mitigation Console",
          "subtitle": "Region: us-east-1 • Cluster: prod-primary"
        }
      },
      {
        "type": "Container",
        "layout": {
          "direction": "row",
          "justify": "between",
          "align": "center"
        },
        "children": [
          {
            "type": "Badge",
            "props": {
              "label": "Traffic: {{trafficAllocation}}%",
              "variant": "destructive"
            }
          },
          {
            "type": "Switch",
            "bind": "maintenanceMode",
            "props": {
              "label": "Isolate Ingress"
            }
          }
        ]
      },
      {
        "type": "Text",
        "props": {
          "label": "Canary Traffic Throttle"
        }
      },
      {
        "type": "ElasticSlider",
        "bind": "trafficAllocation",
        "props": {
          "min": 0,
          "max": 100,
          "label": "Throttle Percentage"
        }
      },
      {
        "type": "Divider"
      },
      {
        "type": "Container",
        "layout": {
          "direction": "row",
          "justify": "between",
          "align": "center"
        },
        "children": [
          {
            "type": "Text",
            "props": {
              "label": "Canary Health Score"
            }
          },
          {
            "type": "Rating",
            "props": {
              "value": 4,
              "max": 5
            }
          }
        ]
      },
      {
        "type": "HoldToConfirm",
        "props": {
          "label": "Hold to Rollback to Stable (v2.14.0)",
          "variant": "destructive"
        },
        "action": {
          "type": "set",
          "target": "trafficAllocation",
          "value": 0
        }
      }
    ]
  }
];