package uz.fikrlovchi.stocker.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun Field(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String = "",
    secret: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    Column(Modifier.padding(top = 14.dp)) {
        Text(label, color = Palette.muted, fontSize = 13.sp)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            placeholder = { Text(placeholder, color = Palette.muted, fontSize = 15.sp) },
            visualTransformation =
                if (secret) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = keyboardType),
            shape = RoundedCornerShape(10.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Palette.text,
                unfocusedTextColor = Palette.text,
                focusedContainerColor = Palette.panel,
                unfocusedContainerColor = Palette.panel,
                focusedBorderColor = Palette.accent,
                unfocusedBorderColor = Palette.line,
                cursorColor = Palette.accent,
            ),
        )
    }
}

@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    loading: Boolean = false,
    enabled: Boolean = true,
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(52.dp),
        enabled = enabled && !loading,
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Palette.accent),
    ) {
        if (loading) {
            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.height(20.dp))
        } else {
            Text(text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
        }
    }
}

@Composable
fun GhostButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    borderColor: Color = Palette.line,
    textColor: Color = Palette.text,
) {
    Box(
        modifier
            .height(48.dp)
            .clip(RoundedCornerShape(10.dp))
            .border(1.dp, borderColor, RoundedCornerShape(10.dp))
            .background(Color.Transparent)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = textColor, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}
