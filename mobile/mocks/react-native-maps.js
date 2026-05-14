// Web stub for react-native-maps — renders a placeholder View on web,
// all map-specific components (Marker, Polyline) are no-ops.
const React = require('react');
const { View, Text } = require('react-native');

function MapView({ children, style }) {
  return React.createElement(
    View,
    {
      style: [
        {
          flex: 1,
          backgroundColor: '#162525',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
        },
        style,
      ],
    },
    React.createElement(
      Text,
      { style: { color: 'rgba(255,255,255,0.2)', fontSize: 13 } },
      'Map view (mobile only)'
    ),
    children
  );
}

MapView.Animated = MapView;

function Marker() { return null; }
function Polyline() { return null; }
function Circle() { return null; }
function Callout() { return null; }

module.exports = MapView;
module.exports.default = MapView;
module.exports.Marker = Marker;
module.exports.Polyline = Polyline;
module.exports.Circle = Circle;
module.exports.Callout = Callout;
