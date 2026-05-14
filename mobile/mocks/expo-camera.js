// Web stub for expo-camera — CameraView renders a placeholder on web.
const React = require('react');
const { View, Text, TouchableOpacity } = require('react-native');

function CameraView({ children, style }) {
  return React.createElement(
    View,
    {
      style: [
        {
          flex: 1,
          backgroundColor: '#0D1B1B',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ],
    },
    React.createElement(
      Text,
      { style: { color: 'rgba(255,255,255,0.3)', fontSize: 14, textAlign: 'center' } },
      'Camera not available on web'
    ),
    children
  );
}

const Camera = CameraView;
Camera.Constants = {
  Type: { back: 'back', front: 'front' },
  FlashMode: { off: 'off', on: 'on', auto: 'auto' },
};

function useCameraPermissions() {
  return [
    { granted: true, status: 'granted' },
    async () => ({ granted: true, status: 'granted' }),
  ];
}

module.exports = { Camera, CameraView, useCameraPermissions };
module.exports.default = Camera;
