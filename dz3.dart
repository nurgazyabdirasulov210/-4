void main() {
  List<int> chisla = [4, 7, 2, 7, 9, 1, 10];

  
  
  int totalSum = chisla.fold(0, (sum, element) => sum + element);

  List<int> Numbers = chisla.where((num) => num % 2 == 0).toList();

  int countGreater = chisla.where((num) => num > 5).length;

  List<int> multiplied = chisla.map((num) => num * 2).toList();

  print('Все числы списка: $chisla');
  print('всего чисел которые больше 5: $countGreater');
  print('Четные числа: $Numbers');
  print('Новый список все числа умножены на 2: $multiplied');
  
}